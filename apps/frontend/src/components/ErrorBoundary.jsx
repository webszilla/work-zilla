import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("UI crash:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || "Unexpected error.";
      return (
        <div className="card p-4">
          <h4 className="mb-2">Something went wrong</h4>
          <p className="text-secondary mb-2">{message}</p>
          <p className="text-secondary mb-0">
            Please refresh the page. If this continues, contact support.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
