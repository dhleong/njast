package net.dhleong.njast;
import net.dhleong.njast.Boring.Fanciest;
import net.dhleong.njast.subpackage.Extended;
import static net.dhleong.njast.Boring.fanciestFactory;
class Foo extends Extended {

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
        Boring biz() {
            return new Boring();
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
            
            Fail failMethod() {
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

    void fooMethodCall() {
        baz(). // moar suggestions
    }

    void fooSuperclassMethodCall() {
        fluidMethod(). 
    }

    Foo delegate = new Foo(42);

    void identifierChain() {
        delegate.field1.buz().field1.method() // silly
        Fanciest.normalFactory()
        fanciestFactory()
    }
}
