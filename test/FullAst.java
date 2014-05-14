
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

    // /** Initialized */
    // Imported field2 = new Imported();

    /** simple method that needs nothing and does nothing */
    void simpleMethod() { /* nop */ }

    FullAst fluidMethod(int arg1, final int arg2) throws Exception { 
        int local1;
        int group1, group2;

        local1 = arg2;
        arg1 += 42;

        myString = "literal";
        myChar = 'a';
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
