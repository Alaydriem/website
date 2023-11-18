'use strict';

import 'vite/modulepreload-polyfill';
import "../scss/home/main.scss";

class Alaydriem {
    constructor() {
        document.addEventListener('DOMContentLoaded', this.domReady.bind(this));
    }

    domReady() {
    }
}

export default new Alaydriem();
