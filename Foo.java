package net.dhleong.njast;

class Foo {

    int field1;

    Foo(int arg1) {
        field1 = arg1;
    }

    @SuppressWarnings({"UnusedDeclaration"})
    int baz(Fancy arg2, Boring arg3) {
        int left, top, right, bottom;

        int up, down=2, in=3, out;

        ((Fanciest) arg3).prepare();
        arg3
            .doBoring(down);
        ((Fancier) arg3).buz().baz().biz().doBar();
        return ((Fancier) arg2).doFancier(arg3);
    }

    Bar biz() {
        return new Bar();
    }
}
