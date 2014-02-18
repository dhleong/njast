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

    nnoremap K :call njast#ShowJavadoc()<cr>
endfunction


augroup njastStart
    autocmd!
    autocmd FileType java call njast#init()
augroup END

" This is basic vim plugin boilerplate
let &cpo = s:save_cpo
unlet s:save_cpo
