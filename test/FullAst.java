
package net.dhleong.njast;

import net.dhleong.njast.subpackage.Imported;
import net.dhleong.njast.subpackage.FullBase;
import net.dhleong.njast.subpackage.FullInterface;

public class FullAst 
        extends FullBase
        implements FullInterface {

    /** Static, but not a block! */
    static Imported field1;

    /** Primitive */
    private int singleInt;

    // /** Initialized */
    // Imported field2 = new Imported();

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
