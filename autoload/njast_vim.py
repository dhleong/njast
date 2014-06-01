
import vim, os, platform, subprocess, urllib2, json, re, time
from threading import Thread

class Njast(object):

    """Manages interactions with Njast server"""

    TIMEOUT = 1

    # lines
    MAX_FULL_BUFFER_SIZE = 750
    BASE_PARTIAL_PREV = 50
    BASE_PARTIAL_NEXT = 50

    _instance = None

    def __init__(self):
        """Private constructor; prefer the #get() singleton accessor """

        self.proc = None
        if vim.eval('exists("g:njast#port")') != '0':
            # specifying g:njast#port triggers debug
            #  mode, where we only connect to that port.
            #  Otherwise, we'll start up our own!
            self.port = vim.eval("g:njast#port")
        else:
            self.port = self._startServer()

        self._lastImplementations = None

    def _gotoDefinition(self):
        data = self._run('define')
        if not data:
            Njast.displayError("Could not resolve definition")
            return
        if data.has_key('error'):
            Njast.displayError(data['error'])
            return

        word = vim.eval("expand('<cword>')")

        if data['path'] == vim.current.buffer.name:
            vim.command('norm %dG' % data['line'])
        else:
            cmd = 'edit +%d %s' % (data['line'], data['path'])
            vim.command(cmd)
        vim.command('silent! call feedkeys("/\\\<%s\\\>\<CR>")' % word)
        vim.command('echo ""')

    def _showJavadoc(self, winno, bufno):
        win = vim.windows[winno-1] # indexing is different
        buf = vim.buffers[bufno]   # indexing is the same (?!)

        data = self._run('document', vimWindow=win, vimBuffer=buf)
        if not data:
            Njast.appendText("Could not resolve definition")
            return
        if data.has_key('error'):
            Njast.appendText(data['error'])
            return

        formatted = None
        if data['type'] == 'var':
            formatted = Njast.SuggestFormat.fields(data['result'])
        elif data['type'] == 'method':
            formatted = Njast.SuggestFormat.methods(data['result'])
        else:
            Njast.appendText("Unexpected object type %s" % data['type'])
            
        Njast.appendText(formatted['info'])

    def _ensureCompletionCached(self):
        if self._lastImplementations is not None:
            return

        cached = vim.eval("b:njastLastCompletionPos")
        curRow, curCol = vim.current.window.cursor
        curLine = vim.current.buffer[curRow - 1]
        
        # TODO grok this; it's borrowed verbatim from tern
        if (curRow == int(cached["row"]) and curCol >= int(cached["end"]) and
                curLine[int(cached["start"]):int(cached["end"])] == cached["word"] and
                (not re.match(".*\\W", curLine[int(cached["end"]):curCol]))):
            return

        data = self._run('suggest', [curRow, curCol])
        self._inflateCompletion(data, curRow, curCol, curLine)

    def _inflateCompletion(self, data, curRow, curCol, curLine):
        if data is None: 
            # cancel silently, but stay in complete mode;
            #   hopefully ycm will work
            vim.command("let b:njastLastCompletionPos.start = -2")
            vim.command("let b:njastLastCompletion = []")
            return

        completions = []
        for type, entries in data["results"].iteritems():
            formatter = getattr(Njast.SuggestFormat, type)
            for entry in entries:

                try:
                    completions.append(formatter(entry))
                except:
                    self._log("Error formatting", entry)

        vim.command("let b:njastLastCompletion = " + json.dumps(completions))
        start, end = (data["start"]["ch"], data["end"]["ch"])
        vim.command("let b:njastLastCompletionPos = " + json.dumps({
            "row": curRow,
            "start": start,
            "end": end,
            "word": curLine[start:end]
        }))

    def _fetchImplementations(self):
        curRow, curCol = vim.current.window.cursor
        curLine = vim.current.buffer[curRow - 1]

        data = self._run('implement', [curRow, curCol])
        self._inflateCompletion(data, curRow, curCol, curLine)

        self._lastImplementations = {}
        if data:
            for methods in data['results']['methods']:
                self._lastImplementations[methods['name']] = methods

    def _attemptImplement(self):
        _, col = vim.current.window.cursor
        word = vim.current.line[:col].strip()

        if not self._lastImplementations.has_key(word):
            self._lastImplementations = None
            return

        method = self._lastImplementations[word]
        self._lastImplementations = None

        # build ultisnips buffer and use it
        buf = '@Override\n'
        buf += method['mods']
        buf += ' ' + method['returns']
        buf += ' ' + method['name']
        buf += '('
        buf += ', '.join([ 'final ' + p['type'] + ' ' + p['name'] \
                        for p in method['params'] ])
        buf += ') {\n'
        buf += '\t${1:// TODO Auto-generated method stub}\n'
        buf += '}'
        
        # safely use UltiSnips manager, if available
        try:
            UltiSnips_Manager.expand_anon(buf, trigger=word)
        except: pass
        
    def _log(self, message, obj=None):
        self._makeRequest('log', {'data': message, 'obj': obj})

    def _makeRequest(self, type, doc, raiseErrors=True):
        try:
          # float(vim.eval("g:tern_request_timeout"))
            url = 'http://localhost:' + str(self.port) + '/' + type
            # req = self.opener.open(url, \
            #                     json.dumps(doc), \
            #                     self.TIMEOUT)
            req = urllib2.Request(url, \
                data=json.dumps(doc), \
                headers={'Content-Type':'application/json'})
            res = urllib2.urlopen(req, timeout=self.TIMEOUT)
            if res.getcode() == 204:
                return True # indicate success somehow

            return json.loads(res.read())
        except urllib2.HTTPError, error:
            if raiseErrors:
                Njast.displayError(error.read())
            return None

    def _asyncRequest(self, type, doc):
        """Create a request via _makeRequest and 
        run it asynchronously. This is just designed
        to update the server's state without slowing
        down vim; it cannot be used to retrieve any data

        :type: Endpoint to hit
        :doc: dict with json data to send

        """

        # build a quick closure to call the request
        #  silently, in case the server isn't running
        #  or whatever
        def safe_caller():
            try:
                self._makeRequest(type, doc, raiseErrors=False)
            except: pass
            
        Thread(target=safe_caller).start()

    def _run(self, type, pos=None, vimWindow=None, vimBuffer=None):
        """Run a command
        """

        if vimWindow is None:
            vimWindow = vim.current.window
        if vimBuffer is None:
            vimBuffer = vim.current.buffer

        if pos is None:
            row, col = vimWindow.cursor
            if vim.eval('mode()') == 'n':
                col += 1
            # pos = {'line': row, 'ch': col}
            pos = [row, col]

        # TODO this stuff
        # seq = vim.eval("undotree()['seq_cur']")
        
        doc = {
            'path': vimBuffer.name,
            'pos': pos,
            'buffer': Njast.extractBuffer(vimWindow, vimBuffer)
        }

        data = None
        try:
            data = self._makeRequest(type, doc)
            if data is None: return None
        except: pass

        return data

    def _stop(self):
        """Stops the njast server, if started
        """
        
        proc = self.proc
        self.proc = None
        if proc is None: return

        proc.stdin.close()
        proc.kill()
        proc.wait()


    def _startServer(self):
        """Initialize the njast server
        :returns: the port on which we started, else None

        """

        # FIXME ensure that npm install was run

        win = platform.system() == "Windows"
        env = None
        if platform.system() == "Darwin":
            env = os.environ.copy()
            env["PATH"] += ":/usr/local/bin"
        command = vim.eval('g:njast#command') # node (path)
        dir = os.path.dirname(command[1])
        proc = subprocess.Popen(command,
                              env=env, cwd=dir,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, shell=win)
        output = ""
        while True:
            line = proc.stdout.readline()
            if not line:
                self.displayError(command[1] + " :: " + dir)
                self.displayError("Failed to start server" +\
                    (output and ":\n" + output))
                self.last_failed = time.time()
                return None
            match = re.match("Listening on port (\\d+)", line)
            if match:
                port = int(match.group(1))
                self.port = port
                self.proc = proc
                return port
            else:
                output += line

    @staticmethod
    def appendText(text):
        """Append text to the current buffer

        :text: Text to append

        """
        vim.current.buffer.append(text.split('\n'))

    @staticmethod
    def bufferSlice(buf, first=0, last=None):
        text = ""
        if last is None:
            last = len(buf)

        while first < last:
            text += buf[first] + "\n"
            first += 1
        return text

    @staticmethod
    def extractBuffer(vimWindow, buf):
        """Extract the appropriate buffer type/amount
        :returns: @todo

        """

        # TODO if we haven't changed anything,
        #  maybe we don't need any buffer

        lines = len(buf)

        if lines < Njast.MAX_FULL_BUFFER_SIZE:
            return {
                'type': 'full',
                'text': Njast.bufferSlice(buf)
            }
        
        # okay, extract a partial buffer
        line, curCol = vimWindow.cursor
        line -= 1 # python lines start at 0
        start = None
        end = None
        mode = 'block'

        regex = re.compile(r"(for|while|if)[ ]*\(")
        depth = 0
        upper = max(0, line - Njast.BASE_PARTIAL_PREV)
        for i in range(line, upper, -1):
            cur = buf[i]
            if start is None:
                # still looking for start...
                # did we find the start of a method/class?
                if cur.find("{") >= 0 and regex.match(cur) is None \
                        and (cur == upper \
                            or regex.match(buf[i-1]) is None): # handle if\n{ folks
                    # ignore nested stuff... it won't start our context!
                    if depth == 0:
                        # Njast.log("Start @", [i, depth])
                        start = i
                        mode = 'body'
                        if cur.find(")") < 0 or cur.find("(") >= 0:
                            break
                        # otherwise, we have an incomplete FormalParams
                        continue

                    else:
                        # Njast.log("Pop depth", depth)
                        depth -= 1

                if cur.find("}") >= 0: # could be both in and out on same line!
                    depth += 1
                #     Njast.log("BumpDepth", [depth, cur])
                # else:
                #     Njast.log("No match", cur)
                #     Njast.log("Depth=", depth)
            else:
                # Njast.log("Search for params start!", cur)
                if cur.find("(") >= 0:
                    start = i
                    break

        if start is None: start = max(0, line - Njast.BASE_PARTIAL_PREV)
        if end is None: end = min(lines, line + Njast.BASE_PARTIAL_NEXT)
        return {
            'type': 'part',
            'text': Njast.bufferSlice(buf, start, end),
            'mode': mode,
            'start': start + 1 # these lines are zero-indexed
        }

    @staticmethod
    def displayError(err):
        vim.command("echo " + json.dumps(str(err)))

    @classmethod
    def get(cls):
        """Singleton accessor
        :returns: the global Njast instance

        """
        if cls._instance is not None:
            return cls._instance

        newInstance = Njast()
        cls._instance = newInstance
        return newInstance

    @classmethod
    def init(cls):
        """Initialize Njast with a new buffer
        :returns: @todo

        """
        path = vim.current.buffer.name
        
        njast = cls.get()
        njast._asyncRequest('init', {'path': path})

    class SuggestFormat:
        """Formats suggestions by types"""
        @staticmethod
        def fields(item):
            mods = ''
            if item.has_key('mods'):
                mods = item['mods'] + ' '
            info = mods + \
                    item['type'] + ' ' + \
                    item['name']
            if item.has_key('javadoc'):
                info += '\n\n' + item['javadoc']
                
            return {
                'word': item['name'],
                'menu': 'field: ' + item['type'] + ' ' + item['name'],
                'info': info
            }

        @staticmethod
        def methods(item):
            returns = item['returns']
            if returns is None:
                returns = '(unknown)'
                
            info = item['mods'] + \
                    ' ' + returns + \
                    ' ' + item['name']

            # arguments
            info += '('
            info += ', '.join([ arg['type'] + ' ' + arg['name'] \
                        for arg in item['params'] ])
            info += ')'

            if item.has_key('javadoc'):
                info += '\n\n' + item['javadoc']

            return {
                'word': item['name'],
                'menu': 'method: ' + item['qualified'],
                'info': info
            }

# generate classmethod shortcuts
def _gen_method(name):
    def method(cls, *args):
        inst = cls.get()
        return getattr(inst, name)(*args)
    return method
    
SHORTCUTS = ['stop', 'run', 'log',
    'attemptImplement',
    'ensureCompletionCached', 
    'fetchImplementations',
    'gotoDefinition',
    'showJavadoc'
    ]
for methodName in SHORTCUTS:
    method = _gen_method('_' + methodName)

    setattr(Njast, methodName, classmethod(method))

