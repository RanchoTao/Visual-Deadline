import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[VD_REACT_RENDER_ERROR]', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-10 text-slate-900">
          <section className="mx-auto max-w-xl rounded-[2rem] border border-white/80 bg-white/85 p-7 text-center shadow-2xl shadow-slate-300/60 backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">VD（Visual Deadline）</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">页面出现异常，请刷新后重试</h1>
            <p className="mt-4 text-sm leading-6 text-slate-500">错误详情已输出到浏览器控制台。刷新后如果仍然异常，请重新登录或清除本地缓存后再试。</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300">刷新页面</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
