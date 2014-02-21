package net.dhleong.njast;

import net.dhleong.njast.util.Fanciest;

class Foo {

    int field1;

    Foo(int arg1) {
        field1 = arg1;
    }

    Fancy baz() {
        return null; // we're not running this code, so...
    }

    @SuppressWarnings({"UnusedDeclaration"})
    Fancy baz(Fancy arg2, Boring arg3) {
        int left, top, right, bottom;

        int up, down=2, in=3, out;

        ((Fanciest) arg3).prepare();
        arg3 // Boring#doBoring -> Normal
            .doBoring(down).doNormal();
        ((Fancier) arg3).buz().baz().biz().doBar();
        return ((Fancier) arg2).doFancier(arg3);
    }

    class Fancy {
        
        Bar biz() {
            return new Bar();
        }

        class Fancier {

            Fancy doFancier(Boring arg) {
                return null; // whatever
            }

            Foo buz() {
                return null; // also whatever
            }
        }
    }

}
