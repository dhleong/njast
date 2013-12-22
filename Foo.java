package net.dhleong.njast;

class Foo {

    int field1;

    Foo(int arg1) {
        field1 = arg1;
    }

    int baz(Fancy arg2, Boring arg3) {
        ((Fanciest) arg3).prepare();
        return ((Fancier) arg2).doFancier(arg3);
    }

}
