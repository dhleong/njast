package net.dhleong.njast;

import net.dhleong.njast.util.Fanciest;

class Foo {

    Fancier field1;

    Foo(int arg1) {
        field1 = NotImported.staticFactory(arg1);
    }

    Fancy baz() {
        return field1. // sic; placed for suggestion testing
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
        
        /** Does biz by Fancy */
        Bar biz() {
            return new Bar();
        }

        class Fancier {

            /**
             * Turns a Boring into a Fancy
             */
            Fancy doFancier(Boring arg) {
                return Foo.this.field1. // new test; should suggest doFancier or method
            }

            /** Buzzes */
            Foo buz() {
                return null; // also whatever
            }

            void bla() {
                Fancier other = new Fancier();
                return other.  // also for testing
                               // parses, now :)
            }

            Fail breaks(Fancier other) {
                other. 
                return null;
            }
            
            Fail method() {
                doFancier(). // suggest from method result
                return null;
            }

            Fancy method() {
                Fancy.this. // reference from inner class
                return null;
            }
        }
    }

    void fooFieldMethod() {
        this.field1. // also for suggestions; tests "this" references AND handling trailing . w/o return
    }

    void fooMethod() {
        this. // moar suggestions
    }
}
