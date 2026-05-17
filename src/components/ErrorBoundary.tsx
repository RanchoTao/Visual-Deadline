import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[VD_RUNTIME_ERROR]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-10 text-slate-900">
          <section className="mx-auto max-w-xl rounded-[2rem] border border-white/80 bg-white/88 p-7 shadow-2xl shadow-slate-300/60 backdrop-blur">
            <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">运行时保护</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">页面遇到异常</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">你的本地数据不会因为这个提示被清空。可以刷新页面重试；如果问题持续出现，请导出备份后联系我们。</p>
            <pre className="mt-5 max-h-44 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{this.state.error.message}</pre>
            <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-slate-300">刷新页面</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
