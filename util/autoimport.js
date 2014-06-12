/**
 * Generated with vim magic and the following script:
        jloader.getTypes(function(types) {
            var lang = types.filter(function(type) {
                return ClassLoader.extractPackage(type) == 'java.lang';
            });

            var foundType = false;
            require('async').eachLimit(lang, 10, function(name, callback) {

                var args = ['-public', '-classpath', jloader._jar, name];
                var splitter = require('child_process').spawn('javap', args)
                    .stdout.pipe(require('stream-splitter')('\n'));
                splitter.on('error', callback);
                splitter.on('token', function(line) {
                    var utf8 = line.toString("UTF-8");
                    if (~utf8.indexOf('{') && ~utf8.indexOf('public')) {
                        foundType = true;
                        console.log(name);
                        // callback();
                    }
                });
                splitter.on('done', function() {
                    // if (!foundType)
                    //     callback(new Error("Could not find/parse " + name));
                    callback(null);
                });

            }, function(err) {
                if (err)
                    console.log(err);

                console.log("DONE");
                done();
            });
        });
 */

var AUTO_IMPORTED = [
    "java.lang.AbstractMethodError",
    "java.lang.Appendable",
    "java.lang.ArithmeticException",
    "java.lang.ArrayIndexOutOfBoundsException",
    "java.lang.ArrayStoreException",
    "java.lang.AssertionError",
    "java.lang.Boolean",
    "java.lang.Byte",
    "java.lang.CharSequence",
    "java.lang.Character",
    "java.lang.Character$Subset",
    "java.lang.Character$UnicodeBlock",
    "java.lang.Class",
    "java.lang.ClassCastException",
    "java.lang.ClassCircularityError",
    "java.lang.ClassFormatError",
    "java.lang.ClassLoader",
    "java.lang.ClassNotFoundException",
    "java.lang.CloneNotSupportedException",
    "java.lang.Cloneable",
    "java.lang.Comparable",
    "java.lang.Compiler",
    "java.lang.Deprecated",
    "java.lang.Double",
    "java.lang.Enum",
    "java.lang.EnumConstantNotPresentException",
    "java.lang.Error",
    "java.lang.Exception",
    "java.lang.ExceptionInInitializerError",
    "java.lang.Float",
    "java.lang.IllegalAccessError",
    "java.lang.IllegalAccessException",
    "java.lang.IllegalArgumentException",
    "java.lang.IllegalMonitorStateException",
    "java.lang.IllegalStateException",
    "java.lang.IllegalThreadStateException",
    "java.lang.IncompatibleClassChangeError",
    "java.lang.IndexOutOfBoundsException",
    "java.lang.InheritableThreadLocal",
    "java.lang.InstantiationError",
    "java.lang.InstantiationException",
    "java.lang.Integer",
    "java.lang.InternalError",
    "java.lang.InterruptedException",
    "java.lang.Iterable",
    "java.lang.LinkageError",
    "java.lang.Long",
    "java.lang.Math",
    "java.lang.NegativeArraySizeException",
    "java.lang.NoClassDefFoundError",
    "java.lang.NoSuchFieldError",
    "java.lang.NoSuchFieldException",
    "java.lang.NoSuchMethodError",
    "java.lang.NoSuchMethodException",
    "java.lang.NullPointerException",
    "java.lang.Number",
    "java.lang.NumberFormatException",
    "java.lang.Object",
    "java.lang.OutOfMemoryError",
    "java.lang.Override",
    "java.lang.Package",
    "java.lang.Process",
    "java.lang.ProcessBuilder",
    "java.lang.Readable",
    "java.lang.Runnable",
    "java.lang.Runtime",
    "java.lang.RuntimeException",
    "java.lang.RuntimePermission",
    "java.lang.SecurityException",
    "java.lang.SecurityManager",
    "java.lang.Short",
    "java.lang.StackOverflowError",
    "java.lang.StackTraceElement",
    "java.lang.StrictMath",
    "java.lang.String",
    "java.lang.StringBuffer",
    "java.lang.StringBuilder",
    "java.lang.StringIndexOutOfBoundsException",
    "java.lang.SuppressWarnings",
    "java.lang.System",
    "java.lang.Thread",
    "java.lang.Thread$State",
    "java.lang.Thread$UncaughtExceptionHandler",
    "java.lang.ThreadDeath",
    "java.lang.ThreadGroup",
    "java.lang.ThreadLocal",
    "java.lang.Throwable",
    "java.lang.TypeNotPresentException",
    "java.lang.UnknownError",
    "java.lang.UnsatisfiedLinkError",
    "java.lang.UnsupportedClassVersionError",
    "java.lang.UnsupportedOperationException",
    "java.lang.VerifyError",
    "java.lang.VirtualMachineError",
    "java.lang.Void"
];

var IMPORTS_BY_NAME = AUTO_IMPORTED.reduce(function(dict, path) {
    var name = path.substr(path.lastIndexOf('.') + 1);
    dict[name] = path;
    return dict;
}, {});

module.exports = {
    findByName: function(name) {
        return IMPORTS_BY_NAME[name];
    }
};
