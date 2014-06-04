#!/usr/bin/env python

import unittest
from njast_vim import Njast

class VimMock(object):

    """Mock vim module"""

    def __init__(self):
        """Initialize vim object """
        self.current = self

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

if __name__ == '__main__':
    tester = unittest.main(failfast=True, exit=False)
    if not tester.result.wasSuccessful():
        print vim.current.buffer
