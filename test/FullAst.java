
package net.dhleong.njast;

import net.dhleong.njast.subpackage.Imported;
import net.dhleong.njast.subpackage.FullBase;
import net.dhleong.njast.subpackage.FullInterface;

/** 
 * Javadoc for FullAst class 
 */
public class FullAst 
        extends FullBase
        implements FullInterface {

    /** Static, but not a block! */
    static Imported field1;

    /** Primitive */
    private int singleInt;

    /** Initialized */
    Imported field2 = new Imported();

    int[] singleArray;

    static {
        field1 = new Imported();
    }

    {
        singleInt = 42;
    }

    /** simple method that needs nothing and does nothing */
    void simpleMethod() { /* nop */ }

    FullAst fluidMethod(int arg1, final int arg2) throws Exception { 
        int local1;
        int group1, group2;

        local1 = arg2;
        arg1 += 42;

        String myString = "literal";
        char myChar = 'a';

        simpleMethod();

        boolean test = field1 instanceof SomeInterface;

        group2 = 4 + arg2;

        // test creator
        field2 = new Imported();

        ++group2;
    }

    static SomeInterface factory() {
        return new SomeInterface() {
        };
    }

    @Override
    @SuppressWarnings(value = "unchecked")
    void overridable() {
        // overridden!
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    void suppressArray() {}

    @SuppressWarnings(value={"unchecked", "rawtypes"})
    void suppressArrayValue() {}

    class NestedClass {
    }

    static class StaticNestedClass {
    }
}

;

interface SomeInterface {
}

;
// TODO
// enum SomeEnum {
// }
//
// ;
//
// @interface SomeAnnotation {
// }
