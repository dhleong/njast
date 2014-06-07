if !has('python')
    echo 'njast requires python support'
    finish
endif

" ------------------------------------------------------------------------
" Python initialization
" ------------------------------------------------------------------------

let s:script_path = fnameescape(expand('<sfile>:p:h'))
execute 'pyfile '.s:script_path.'/njast_vim.py'

" ------------------------------------------------------------------------
" Configs
" ------------------------------------------------------------------------

if !exists('g:njast#command')
  " apparently <sfile> is not available from python :(
  let g:njast#command = ["node", expand('<sfile>:h:h') . '/server.js']
endif

" ------------------------------------------------------------------------
" Vim interface
" ------------------------------------------------------------------------

function! njast#_attemptImplement()
    exe 'py Njast.attemptImplement()'
    iunmap <buffer> <c-cr>
    return ""
endfunction

function! njast#GotoDefinition()
    py Njast.gotoDefinition()
endfunction

function! njast#ImplementMethod()
    py Njast.fetchImplementations()

    if exists('g:UltiSnipsExpandTrigger')
        " prepare temp mapping that overrides ultisnips
        exe 'inoremap <buffer> ' . g:UltiSnipsExpandTrigger 
            \ . ' <C-R>=njast#_attemptImplement()<CR>'
    endif
    
    " trigger omnicomplete 
    startinsert
    call feedkeys("\<c-x>\<c-o>")
endfunction

function! njast#ShowJavadoc()
    let l:word = expand("<cword>")
    let l:window = winnr()
    let l:buffer = bufnr('%')

    call njast#util#showWindow()

    " fetch doc
    exe 'py Njast.showJavadoc(' . l:window . ', ' . l:buffer . ')'

    call njast#util#resizeWindow()

    " pop back
    wincmd p
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
    py Njast.init()

    nnoremap <buffer> K :call njast#ShowJavadoc()<cr>
    nnoremap <buffer> gd :call njast#GotoDefinition()<cr>

    augroup NjastBuffer
        autocmd! * <buffer>
        autocmd BufWritePost <buffer> :py Njast.update()
        autocmd CursorHold,CursorHoldI <buffer> :py Njast.onInterval()
    augroup END

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
