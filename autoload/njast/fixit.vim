if !has('python')
    echo 'njast requires python support'
    finish
endif

" ------------------------------------------------------------------------
" Python initialization
" ------------------------------------------------------------------------

" let s:script_path = fnameescape(expand('<sfile>:p:h'))
" execute 'pyfile '.s:script_path.'/fixit.py'

" ------------------------------------------------------------------------
" Private methods
" ------------------------------------------------------------------------

function! s:append(line)
    call append(line('.'), a:line)
    normal G
endfunction

" ------------------------------------------------------------------------
" Vim interface
" ------------------------------------------------------------------------

"
" Convenience to add an entry to the 
"  fixit list for the current file. 
"  We could also add it to Syntastic
"
"  Each entry is a dict structured as follows:
"  {
"    desc: "Text description of the problem",
"    line: 1, // line number on which the problem was found
"    ch:   1, // character/col number
"    fixes: [
"       // array of fix descriptions
"       {
"           desc: "Text description of the fix"
"           exec: "Exec-able string to be exec'd when selected"
"       }
"    ]
"  }
"
function! njast#fixit#add(info)
    let list = njast#fixit#getList()
    call add(list, a:info)

    " TODO syntastic integration?
endfunction

"
" Apply the fix on the current line, if any
"
function! njast#fixit#apply()
    let line = getline('.')
    if line =~ '^[ ]*[0-9]\+\.[0-9]\+:'
        let fixId = substitute(line, '^[ ]*\([0-9.]\+\):.*', '\1', '')
        let indexes = split(fixId, '\.')
        
        let list = njast#fixit#getList()
        let entry = list[indexes[0]]
        let fix = entry.fixes[indexes[1]]

        try
            " jump back...
            wincmd p 

            " ... execute the command
            exec fix.exec

            " ... and return again
            wincmd p 

            " Done without error! remove the item from the list
            call remove(list, indexes[0])

            call njast#fixit#show()
        catch 
            echoerr "Unable to " . fix.desc
        endtry

    elseif line =~ '^[0-9]\+:'
        " jump to problem location
        let indexes = split(line, ' ')

        let list = njast#fixit#getList()
        let entry = list[indexes[0]]
        
        wincmd p
        call cursor(entry.line, entry.ch)
    endif
endfunction

"
" Show the fixit window. 
" @param background If == 1, will show the window in the "background."
"  That is, the user will remain in the buffer they started in, and
"  at the same cursor position
"
function! njast#fixit#show(...)

    " get list now before we change buffers
    let list = njast#fixit#getList()

    if len(list) == 0
        " nothing to do!
        pclose
        wincmd p
        return
    endif

    " prepare the window
    call njast#util#showWindow()
    setlocal cursorline
    nnoremap <silent> <buffer> <cr>
        \ :call njast#fixit#apply()<cr>

    " save a ref to the list inside the buffer
    let b:njast_fixit__list = list

    " build!
    let entry = 0
    for item in list
        let line = entry . ':   ' . item.desc
        call s:append(line)

        let fixIndex = 0
        for f in item.fixes
            let line = '    ' . entry . '.' . fixIndex . ': ' . f.desc
            call s:append(line)

            let fixIndex = fixIndex + 1
        endfor

        call s:append('') " extra spacer line
        let entry = entry + 1
    endfor

    call njast#util#resizeWindow()

    " select first suggestion
    normal! gg
    normal! 3G

    if a:0 > 0 && a:1 == 1
        " open-in-background mode; restore last window
        wincmd p
    endif
endfunction

"
" Retrieve (creating if necessary) the
"  fixit list for the current buffer
"
function! njast#fixit#getList()
    if !exists('b:njast_fixit__list')
        let b:njast_fixit__list = []
    endif

    return b:njast_fixit__list
endfunction
