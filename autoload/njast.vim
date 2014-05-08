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
