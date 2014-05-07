if !has('python')
    echo 'njast requires python support'
    finish
endif

py << endpy

import vim, os, platform, subprocess, urllib2, json, re, time

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

    def _ensureCompletionCached(self):
        cached = vim.eval("b:njastLastCompletionPos")
        curRow, curCol = vim.current.window.cursor
        curLine = vim.current.buffer[curRow - 1]
        
        # TODO grok this; it's borrowed verbatim from tern
        if (curRow == int(cached["row"]) and curCol >= int(cached["end"]) and
                curLine[int(cached["start"]):int(cached["end"])] == cached["word"] and
                (not re.match(".*\\W", curLine[int(cached["end"]):curCol]))):
            return

        data = self._run('suggest', [curRow, curCol])
        print data
        if data is None: return

        completions = []
        for type, entries in data["results"].iteritems():
            # TODO
            # completions.append({"word": rec["name"],
            #                     "menu": tern_asCompletionIcon(rec.get("type")),
            #                     "info": tern_typeDoc(rec) })
            for entry in entries:
                info = '?'
                if entry.has_key('returns'):
                    info = entry['returns']
                elif entry.has_key('type'):
                    info = entry['type']

                completions.append({
                    'word': entry['name'],
                    'menu': '(?)',
                    'info': info
                })

        vim.command("let b:njastLastCompletion = " + json.dumps(completions))
        start, end = (data["start"]["ch"], data["end"]["ch"])
        vim.command("let b:njastLastCompletionPos = " + json.dumps({
            "row": curRow,
            "start": start,
            "end": end,
            "word": curLine[start:end]
        }))

    def _makeRequest(self, type, doc):
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
            return json.loads(res.read())
        except urllib2.HTTPError, error:
            Njast.displayError(error.read())
            return None

    def _run(self, type, pos=None):
        """Run a command
        """

        if pos is None:
            row, col = vim.current.window.cursor
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
        
        if self.proc is None: return
        self.proc.stdin.close()
        self.proc.kill()
        self.proc.wait()
        self.proc = None


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
        :returns: @todo

        """
        if cls._instance is not None:
            return cls._instance

        newInstance = Njast()
        cls._instance = newInstance
        return newInstance

# generate classmethod shortcuts
def gen_method(name):
    def method(cls, *args):
        inst = cls.get()
        return getattr(inst, name)(*args)
    return method
    
SHORTCUTS = ['stop', 'run', 'ensureCompletionCached']
for methodName in SHORTCUTS:
    method = gen_method('_' + methodName)

    setattr(Njast, methodName, classmethod(method))

endpy

if !exists('g:njast#command')
  " apparently <sfile> is not available from python :(
  let g:njast#command = ["node", expand('<sfile>:h:h') . '/server.js']
endif


function! njast#ShowJavadoc()
    let l:word = expand("<cword>")
    echo l:word

    silent topleft new '--javadoc--'

    " some settings
    setlocal buftype=nofile bufhidden=wipe noswapfile ft=java modifiable nowrap
    nnoremap <buffer> q ZQ
    nnoremap <buffer> K ZQ
    nnoremap <buffer> <esc> ZQ
    nnoremap <buffer> <tab> <C-W>j

    " resize window to match output
    let l:lines = line('$')
    if l:lines > 30
        " limit size
        let l:lines = 30 
    endif
    execute 'resize' l:lines


endfunction


function! njast#Complete(findstart, complWord)
    if a:findstart
        py Njast.ensureCompletionCached()
        return b:njastLastCompletionPos['start']
    elseif b:njastLastCompletionPos['end'] - b:njastLastCompletionPos['start'] == len(a:complWord)
        return b:njastLastCompletion

    else
        let rest = []
        for entry in b:njastLastCompletion
            if stridx(entry["word"], a:complWord) == 0
                call add(rest, entry)
            endif
        endfor
        return rest
    endif
endfunction


function! njast#Enable()
    if stridx(&buftype, "nofile") > -1 || stridx(&buftype, "nowrite") > -1
      return
    endif
    let b:njastLastCompletion = []
    let b:njastLastCompletionPos = {'row': -1, 'start': 0, 'end': 0}
    " let b:ternBufferSentAt = -1
    " let b:ternInsertActive = 0
    setlocal omnifunc=njast#Complete
    py Njast.get()

    nnoremap K :call njast#ShowJavadoc()<cr>
    " if g:tern_map_keys
    "   call tern#DefaultKeyMap(g:tern_map_prefix)
    " endif
    " augroup TernAutoCmd
    "   autocmd! * <buffer>
    "   autocmd BufLeave <buffer> :py tern_sendBufferIfDirty()
    "   if g:tern_show_argument_hints == 'on_move'
    "     autocmd CursorMoved,CursorMovedI <buffer> call tern#LookupArgumentHints()
    "   elseif g:tern_show_argument_hints == 'on_hold'
    "     autocmd CursorHold,CursorHoldI <buffer> call tern#LookupArgumentHints()
    "   endif
    "   autocmd InsertEnter <buffer> let b:ternInsertActive = 1
    "   autocmd InsertLeave <buffer> let b:ternInsertActive = 0
    " augroup END
endfunction

augroup NjastShutDown
  autocmd VimLeavePre * call njast#Shutdown()
augroup END


function! njast#Shutdown()
  py Njast.stop()
endfunction
