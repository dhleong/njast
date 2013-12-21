package net.dhleong.njast;

import net.dhleong.njast.Fancy;
import net.dhleong.njast.Fancier;

class Foo {

    int field1;

    Foo(int arg1) {
        field1 = arg1;
    }

    int baz(Fancy arg2, float arg3) {
        return ((Fancier) arg2).doFancier(arg3);
    }
}
