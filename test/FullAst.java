
@PackageAnnotation
package net.dhleong.njast;

import java.io.IOException;

import net.dhleong.njast.subpackage.Imported;
import net.dhleong.njast.subpackage.FullBase;
import net.dhleong.njast.subpackage2.*;
import static net.dhleong.njast.subpackage.Extended.createExtended;

/**
 * Javadoc for FullAst class
 */
public class FullAst<E, T extends Object & Imported>
        extends FullBase
        implements FullInterface {

    /** Static, but not a block! */
    static Imported field1;

    /** Primitive */
    private int singleInt;

    /** Initialized */
    Imported field2 = new Imported();

    final int[] singleArray = {1, 2, 3};

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
        group2++; // make sure postfix is parsed

        int[] array1 = new int[1];
        int[] array2 = {2, 3};
        int[] array3 = new int[] {4, 5, 6};
        int[][] array4 = {{7, 8}, {9, 10}};
        int[][][] array5 = new int[11][12][];

        group2 = array4[0][1] + this.singleArray[2];

        this.<Imported>generic(field1);

        Class<?> myClass = FullAst.class;
        Class<?> arrayClass = int[][].class;
        Class<?> objectArrayClass = FullAst[][].class;
        Class<?> voidClass = void.class;

        return this;
    }

    static SomeInterface factory() {
        return new SomeInterface() {
        };
    }

    @Override
    @SuppressWarnings(value = "unchecked")
    void overridable() {
        // overridden!
        field1 = fluidMethod().getImported();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    void suppressArray() {}

    @SuppressWarnings(value={"unchecked", "rawtypes"})
    void suppressArrayValue() {}

    void controlsMethod() {
        if (singleArray[0] == singleInt) {
            assert singleInt == 1;
        } else if (singleArray[1] == singleInt) {
            assert singleInt == 2 : "Weird";
        }

        switch(singleInt) {
        case 5:
            simpleMethod();
            break;
        default:
        }

        // and again, with an enum
        SomeEnum val = SomeEnum.VAL1;
        switch(val) {
        case VAL1:
            simpleMethod();
        case VAL2:
        default:
            overridable();
        }

        for (int i=0, j=1; i < 5; i++)
            suppressArray();

        for (int i : new int[]{1, 2, 3}) {
            suppressArray();
        }

        for (;;) break; // useless, but important to test
        int x = 0;
        for (; x < 10;)
            x++;

        while (false) {}
    PreDo:
        do {
            x++;
            if (x < 5)
                continue PreDo; // won't happen, but let's parse
        } while (x < 20);

        if (singleArray.length > 42)
            throw new Exception("hi");

        synchronized(field1) {
            suppressArray();
        }

        try {
            // 
        } finally {
            // finally
        }

        try {
            // 
        } catch (Exception e) {
        }

        try {
            // 
        } catch (Exception e) {
        } finally {
        }

        try {
            // 
        } catch (IOException|RuntimeException e) {
        }

        try (InputStream in = field2.open()) {
            // block
        }

        super.overridable();
    }

    /*
     * Constructor
     */
    FullAst() {
        this(SomeAnnotation.MAGIC);
    }
    FullAst(final int arg) {
        singleInt = arg;
    }
    <Y> FullAst(Y obj) {
        // generic constructor
    }

    public <T> void generic(T arg) {
        FullAst<? extends Object, Imported>.NestedClass<FullInterface> object =
            new FullAst.NestedClass<>();

        // call generic constructor
        new <Imported>FullAst<>(field1);
    }

    public FullAst<? extends Imported, Imported> cast(FullBase arg) {
        FullAst cast = (FullAst) arg;

        ((FullAst) arg).generic(null);

        // cast to FullInterface is unncessary, but good for testing
        ((FullInterface) (((FullAst) arg).fluidMethod())).interfaceMethod();
    }

    public Imported getImported() {
        return new Imported();
    }

    static SomeInterface localClassFactory() {
        class LocalClass implements SomeInterface {
        }

        return new LocalClass();
    }

    static SomeInterface otherLocalClassFactory() {
        class LocalClass implements SomeInterface {
        }

        return new LocalClass();
    }

    void genericCast() {

        // generic with more wildcards
        final FullAst<? extends Imported, Imported> actual = this
                .cast((FullAst<? extends Imported, Imported>) null);
    }

    void fancyTernary(NestedClass<?> contentTypeEl) {
        final String contentTypeRaw = 
            (contentTypeEl == null || contentTypeEl.boolMethod())
                ? null // umm...?
                : contentTypeEl.toString();
    }

    boolean instanceofAnd(Object o) {
        return o instanceof FullAst
                && field1.equals(((FullAst)o).field1);
    }

    /** Mostly to test declaring type resolution */
    void fieldExtendedMethod() {
        field1.fluidMethod();
        Extended.createExtended();
    }

    /*
     * Nested classes
     */

    class NestedClass<T> {
        void ncMethod() {
            this.outerClassMethod();
        }

        void outerClassMethod() {

            FullAst.this.simpleMethod();

            // crazy gross generic instantiation of inner class
            FullAst.this.new <Imported>FullAst<>(FullAst.this.field1);
        }

        public void callNestedSuper() {
            Foo.super.overridable();
        }

        boolean boolMethod() {
            return false;
        }
    }

    static class StaticNestedClass {
    }

    enum NestedEnum {
    }

    void moreTests(int count, int max) {

        // this would crash, but whatever
        singleArray[singleInt++] = 0;


        boolean canScrollDown = (singleArray[0] + count) < max;
    }

}

;

interface SomeInterface {
}

;

enum SomeEnum {
    VAL1,
    VAL2(22),
    VAL3 {
        // body!
    };

    int myMagic;

    SomeEnum() {
        // this(42);
        myMagic = 42;
    }
    SomeEnum(int magic) {
        myMagic = magic;
    }
}

;

@interface SomeAnnotation {

    static final int MAGIC = 42;

    static final float FLOAT_LITERAL = .8f;

    int[] array() default {MAGIC, 2, 1};
}

;
