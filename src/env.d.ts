declare global {
  interface Window {
    /**
     * Runs the live-status client on demand.
     *
     * The client reads its URL from a meta tag and does nothing when that is
     * empty. Exposing the initialiser lets the end-to-end suite point it at a
     * mocked response and assert the one constraint the two-state hero rests
     * on: that upgrading never moves layout. It changes no behaviour on a
     * normal page load.
     */
    __initLiveStatus: () => void;
  }
}

export {};
