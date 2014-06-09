#!/usr/bin/env python

import unittest
from njast_vim import Njast

# Mock object class definitions {{{1
# VimMock {{{2
class VimMock(object):

    """Mock vim module"""

    def __init__(self):
        """Initialize vim object """
        self.current = self

    def setWindow(self, win):
        self.window = win
        self.buffer = win.buffer

# VimBuffer {{{2
class VimBuffer(object):

    """Fake buffer object"""

    def __init__(self, lines):
        """Init

        :lines: @todo

        """

        if type(lines) == str:
            self._lines = lines.split('\n')
        else:
            self._lines = lines
        
    def __getitem__(self, index):
        return self._lines[index]

    def __len__(self):
        return len(self._lines)

    def __str__(self):
        return '\n'.join(['%2d. %s' % it for it in enumerate(self._lines)])

    def append(self, line, index=None):
        if index is None:
            index = len(self._lines)

        self._lines.insert(index, line)

# VimWindow {{{2
class VimWindow(object):

    """Contains a buffer and a cursor"""

    def __init__(self, buffer, cursor=(1, 1)):
        """Create a window object

        :buffer: @todo
        :cursor: @todo

        """
        self.buffer = buffer
        self.cursor = cursor

# }}}1

# global vim
vim = VimMock()

class TestImportInsert(unittest.TestCase):

    '''The first import line'''
    FIRST = 7

    def setUp(self):
        vim.buffer = VimBuffer(
'''
package net.dhleong.njast;

/**
 * Some comments
 */

import java.util.HashMap;

import net.dhleong.njast.Foo;
import net.dhleong.njast.subpackage.Bar;

public class Awesome {
}
'''
        )
        self.buf = vim.current.buffer
    
    def test_Faster(self):
        path = 'net.dhleong.njast.Faster'
        line = 'import %s;' % path
        Njast.UpdateHandler._insertImport(self.buf, path)
        self.assertEquals(self.buf[self.FIRST+2], line)

    def test_Slower(self):
        path = 'net.dhleong.njast.Slower'
        line = 'import %s;' % path
        Njast.UpdateHandler._insertImport(self.buf, path)
        self.assertEquals(self.buf[self.FIRST+3], line)

    def test_Collection(self):
        path = 'java.util.Collection'
        line = 'import %s;' % path
        Njast.UpdateHandler._insertImport(self.buf, path)
        self.assertEquals(self.buf[self.FIRST], line)

    def test_Queue(self):
        path = 'java.util.Queue'
        line = 'import %s;' % path
        Njast.UpdateHandler._insertImport(self.buf, path)
        self.assertEquals(self.buf[self.FIRST+1], line)

    # TODO test a com.* package

class BufferExtraction(unittest.TestCase):

    def setUp(self):
        vim.buffer = VimBuffer(
'''public class Foo {

    void onReceive(final Message pkt) {

        final Thread thread = pkt.getThread();
        thread. // imagine we're typing
        if (thread != null && !MessagingService.isUserShown(pkt.user_slug)) {
            thread.setTyping(pkt.is_typing);
            thread. // more typing
        }
    }
    
    static Message lastMessage = null; // I dunno, whatever

    static Message nextMessage = // also typing

}
'''
        )
        vim.setWindow(VimWindow(vim.buffer, cursor=(7, 19)))

        self.__maxSize = Njast.MAX_FULL_BUFFER_SIZE
        Njast.MAX_FULL_BUFFER_SIZE = 3 # absurdly small to force partial

    def tearDown(self):
        Njast.MAX_FULL_BUFFER_SIZE = self.__maxSize

    def test_InsideMethod(self):
        vim.window.cursor = (5, 16)
        buf = Njast.extractBuffer(vim.window, vim.buffer)
        self.assertEquals(buf['start'], 3)
        self.assertEquals(buf['mode'], 'body')

    # TODO Not sure the best way to handle this case yet, actually;
    #  Current algorithm just sees the close bracket as possibly
    #  a closed IF and bumps the depth, which is important as the
    #  most common case will be typing inside a method...
    # def test_Block(self):
    #     vim.window.cursor = (14, 34)
    #     buf = Njast.extractBuffer(vim.window, vim.buffer)
    #     self.assertEquals(buf['start'], 11)
    #     self.assertEquals(buf['mode'], 'block')

    def test_NestedIf(self):
        vim.window.cursor = (8, 19)
        buf = Njast.extractBuffer(vim.window, vim.buffer)
        self.assertEquals(buf['start'], 3)
        self.assertEquals(buf['mode'], 'body')


if __name__ == '__main__':
    tester = unittest.main(failfast=True, exit=False)
    if not tester.result.wasSuccessful():
        print vim.current.buffer

# vim: set sw=4 sts=4 et fdm=marker:
