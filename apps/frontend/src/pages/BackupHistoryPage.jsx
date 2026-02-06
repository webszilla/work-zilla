import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  items: [],
  total: 0
};

const pageSize = 10;

export default function BackupHistoryPage() {
  const [state, setState] = useState(emptyState);
  const [products, setProducts] = useState([]);
  const [productSlug, setProductSlug] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const subs = await apiFetch("/api/auth/subscriptions");
        if (!active) return;
        const list = (subs.subscriptions || []).map((entry) => ({
          slug: entry.product_slug,
          name: entry.product_name || entry.product_slug
        }));
        setProducts(list);
        if (!productSlug && list.length) {
          setProductSlug(list[0].slug);
        }
      } catch {
        if (!active) return;
        setProducts([]);
      }
    }
    loadProducts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      if (!productSlug) {
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const params = new URLSearchParams();
        params.set("limit", String(pageSize));
        params.set("offset", String((page - 1) * pageSize));
        params.set("product_slug", productSlug);
        const data = await apiFetch(`/api/backup/list?${params.toString()}`);
        if (!active) return;
        setState({
          loading: false,
          error: "",
          items: Array.isArray(data.items) ? data.items : [],
          total: data.total || 0
        });
      } catch (error) {
        if (!active) return;
        setState({
          loading: false,
          error: error?.message || "Unable to load backup history.",
          items: [],
          total: 0
        });
      }
    }
    loadHistory();
    return () => {
      active = false;
    };
  }, [productSlug, page]);

  const totalPages = Math.max(1, Math.ceil(state.total / pageSize));

  return (
    <>
      <h2 className="page-title">Backup History</h2>
      <hr className="section-divider" />

      <div className="card p-3 mb-3">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label">Product</label>
            <select
              className="form-select"
              value={productSlug}
              onChange={(event) => {
                setProductSlug(event.target.value);
                setPage(1);
              }}
            >
              {products.length ? (
                products.map((product) => (
                  <option key={product.slug} value={product.slug}>
                    {product.name}
                  </option>
                ))
              ) : (
                <option value="">No products</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <div className="card p-3">
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Size</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr>
                  <td colSpan="6">Loading backups...</td>
                </tr>
              ) : state.items.length ? (
                state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name || "-"}</td>
                    <td>{item.status || "-"}</td>
                    <td>{item.size_bytes ? `${(item.size_bytes / (1024 * 1024)).toFixed(2)} MB` : "-"}</td>
                    <td>{item.completed_at || item.requested_at || "-"}</td>
                    <td>{item.expires_at || "-"}</td>
                    <td>
                      {item.can_download && item.download_url ? (
                        <a className="btn btn-sm btn-outline-light" href={item.download_url}>
                          Download
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No backups yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="table-info">
            Showing {state.items.length ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, state.total)} of {state.total} entries
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            showPageLinks
            showPageLabel={false}
            maxPageLinks={7}
          />
        </div>
      </div>
    </>
  );
}
