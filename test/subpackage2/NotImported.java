
package net.dhleong.njast.subpackage2;

public class NotImported {
    
    // NB: We don't import Fancier, either
    public static Fancier staticFactory(int arg1) {
        // it would actually be a pain in the ass to
        //  instantiate a Fancier, here, since it's
        //  a non-static inner class of another 
        //  non-static inner class
        return null;
    }

}
