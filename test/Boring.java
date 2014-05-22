package net.dhleong.njast;

class Boring {
    static class Normal {
        void doNormal();
    }

    static class Fanciest {

        Boring prepare() {
            return new Boring();
        }
    }

    Normal doBoring() {
        return new Normal();
    }

    Boring doBar() {
        return this;
    }
}
