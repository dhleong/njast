
"
" Prepare a temp window
"
function! njast#util#showWindow()

    " silent topleft new '--javadoc--'
    pclose

    " some settings
    new 
    setlocal buftype=nofile bufhidden=wipe ft=java 
    setlocal noswapfile nowrap previewwindow
    nnoremap <buffer> q ZQ
    " nnoremap <buffer> K ZQ
    " nnoremap <buffer> <esc> ZQ
    " nnoremap <buffer> <tab> <C-W>p
endfunction


"
" Resize the current window to match its
"   height, if possible
"
function! njast#util#resizeWindow()

    " resize window to match output
    let l:max_height = 30 " TODO config'able, possbly as percentage
    let l:lines = line('$')
    if l:lines > l:max_height
        " limit size
        let l:lines = l:max_height
    endif
    execute 'resize' l:lines

endfunction
