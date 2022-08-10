'use strict';

import 'vite/modulepreload-polyfill';
import "../scss/main.scss";

class Alaydriem {
    constructor() {
        document.addEventListener('DOMContentLoaded', this.domReady.bind(this));
    }

    domReady() {
    }
}

export default new Alaydriem();
