
package net.dhleong.njast.subpackage;

public class Extended {

    public Extended fluidMethod() {
        return this;
    }

    static Extended createExtended() {
        return new Extended() {
        };
    }
}
