import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Last line of defence against a blank window: without a boundary, any
// uncaught render error unmounts the whole React tree and leaves the page
// black. This catches it, logs it (the desktop shell forwards console errors
// to ~/.reqly/desktop.log), and offers a one-click reload.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[reqly-ui] Uncaught render error: ${error.stack || error.message}\nComponent stack:${info.componentStack ?? ' unavailable'}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#0f0f12] px-6 text-zinc-200">
        <div className="text-lg font-semibold">Something went wrong</div>
        <div className="max-w-xl text-center text-sm text-zinc-400">
          The Reqly UI hit an unexpected error. Reload to continue - your collections and history are safe on disk.
        </div>
        <pre className="max-h-48 w-full max-w-xl overflow-auto rounded border border-zinc-800 bg-black/40 p-3 text-xs text-red-400">
          {this.state.error.stack || this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
        >
          Reload
        </button>
      </div>
    );
  }
}
