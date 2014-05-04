if !has('python')
    echo 'njast requires python support'
    finish
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

function! njast#init()

endfunction


function! njast#Complete(findstart, complWord)
    " TODO
    if a:findstart
    "   python tern_ensureCompletionCached()
    "   return b:ternLastCompletionPos['start']
    " elseif b:ternLastCompletionPos['end'] - b:ternLastCompletionPos['start'] == len(a:complWord)
    "   return b:ternLastCompletion

        return -3 " cancel silently and leave completion
    else
        let rest = []
    "   for entry in b:ternLastCompletion
    "     if stridx(entry["word"], a:complWord) == 0
    "       call add(rest, entry)
    "     endif
    "   endfor
        return rest
    endif
endfunction


function! njast#Enable()
    if stridx(&buftype, "nofile") > -1 || stridx(&buftype, "nowrite") > -1
      return
    endif
    " let b:ternProjectDir = ''
    " let b:ternLastCompletion = []
    " let b:ternLastCompletionPos = {'row': -1, 'start': 0, 'end': 0}
    " let b:ternBufferSentAt = -1
    " let b:ternInsertActive = 0
    setlocal omnifunc=njast#Complete

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


function! tern#Shutdown()
  " TODO
  " py tern_killServers()
endfunction
