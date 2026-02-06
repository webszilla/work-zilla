import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import TablePagination from "../components/TablePagination.jsx";

const emptyState = {
  loading: true,
  error: "",
  items: [],
  total: 0
};

const pageSize = 25;

export default function SaasAdminBackupActivityPage() {
  const [state, setState] = useState(emptyState);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const params = new URLSearchParams();
        params.set("limit", String(pageSize));
        params.set("offset", String((page - 1) * pageSize));
        if (search.trim()) params.set("q", search.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (productFilter) params.set("product_id", productFilter);
        const data = await apiFetch(`/api/saas-admin/backup-activity?${params.toString()}`);
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
          error: error?.message || "Unable to load backup activity.",
          items: [],
          total: 0
        });
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [search, statusFilter, productFilter, page]);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const data = await apiFetch("/api/saas-admin/overview");
        if (!active) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
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

  const totalPages = Math.max(1, Math.ceil(state.total / pageSize));

  return (
    <>
      <h2 className="page-title">Org Downloads</h2>
      <hr className="section-divider" />

      <div className="card p-3 mb-3">
        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label">Search Org</label>
            <input
              type="text"
              className="form-control"
              placeholder="Organization name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="expired">Expired</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Product</label>
            <select
              className="form-select"
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
            >
              <option value="">All</option>
              {products.map((product) => (
                <option key={product.id} value={String(product.id)}>
                  {product.name}
                </option>
              ))}
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
                <th>Org</th>
                <th>Product</th>
                <th>Admin User</th>
                <th>Size</th>
                <th>Status</th>
                <th>Generated</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              {state.loading ? (
                <tr>
                  <td colSpan="7">Loading activity...</td>
                </tr>
              ) : state.items.length ? (
                state.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.organization_name || "-"}</td>
                    <td>{row.product_name || "-"}</td>
                    <td>{row.admin_user || "-"}</td>
                    <td>{row.size_bytes ? `${(row.size_bytes / (1024 * 1024)).toFixed(2)} MB` : "-"}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.completed_at || row.requested_at || "-"}</td>
                    <td>{row.expires_at || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">No backup activity.</td>
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
