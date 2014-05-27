
import vim, os, platform, subprocess, urllib2, json, re, time
from threading import Thread

class Njast(object):

    """Manages interactions with Njast server"""

    DEBUG = True
    TIMEOUT = 1
    _instance = None

    def __init__(self):
        """Private constructor; prefer the #get() singleton accessor """
        if self.DEBUG:
            self.port = 3000
        else:
            self.port = self._startServer()
        self.proc = None

        self._lastImplementations = None

    def _gotoDefinition(self):
        data = self._run('define')
        if not data:
            Njast.displayError("Could not resolve definition")
            return
        if data.has_key('error'):
            Njast.displayError(data['error'])
            return

        cmd = 'edit +%d %s' % (data['line'], data['path'])
        vim.command(cmd)

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
            # TODO
            # completions.append({"word": rec["name"],
            #                     "menu": tern_asCompletionIcon(rec.get("type")),
            #                     "info": tern_typeDoc(rec) })
            formatter = getattr(Njast.SuggestFormat, type)
            for entry in entries:

                completions.append(formatter(entry))

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
        
    def _log(self, message):
        self._makeRequest('log', {'data': message})

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
        kwargs = {
            'type': type,
            'doc': doc,
            'raiseErrors': False
        }
        Thread(target=self._makeRequest, kwargs=kwargs).start()

    def _run(self, type, pos=None):
        """Run a command
        """

        if pos is None:
            row, col = vim.current.window.cursor
            if vim.eval('mode()') == 'n':
                col += 1
            # pos = {'line': row, 'ch': col}
            pos = [row, col]

        # TODO this stuff
        # seq = vim.eval("undotree()['seq_cur']")
        
        doc = {
            'path': vim.eval("expand('%:p')"), 
            'pos': pos
        }
        # TODO partial buffers?
        doc['buffer'] = Njast.bufferSlice(vim.current.buffer)

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
        Njast.displayError(command[1] + " :: " + dir)
        proc = subprocess.Popen(command,
                              env=env, cwd=dir,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, shell=win)
        output = ""
        while True:
            line = proc.stdout.readline()
            if not line:
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
    def bufferSlice(buf, first=0, last=None):
        text = ""
        if last is None:
            last = len(buf)

        while first < last:
            text += buf[first] + "\n"
            first += 1
        return text

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
            info = item['mods'] + \
                    ' ' + item['returns'] + \
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
    
SHORTCUTS = ['stop', 'run', 
    'ensureCompletionCached', 
    'gotoDefinition',
    'fetchImplementations',
    'attemptImplement']
for methodName in SHORTCUTS:
    method = _gen_method('_' + methodName)

    setattr(Njast, methodName, classmethod(method))

