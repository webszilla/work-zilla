export default function TablePagination({
  page,
  totalPages,
  onPageChange,
  showPageLinks = false,
  showPageLabel = true,
  maxPageLinks = 7,
}) {
  if (totalPages <= 1) {
    return null;
  }

  const handleJump = () => {
    const next = window.prompt(`Go to page (1-${totalPages})`, String(page));
    if (!next) {
      return;
    }
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const target = Math.min(Math.max(Math.trunc(parsed), 1), totalPages);
    if (target !== page) {
      onPageChange(target);
    }
  };

  const buildPageItems = () => {
    if (!showPageLinks) {
      return [];
    }
    if (totalPages <= maxPageLinks) {
      return Array.from({ length: totalPages }, (_, index) => ({
        type: "page",
        number: index + 1,
      }));
    }

    const visibleCount = Math.max(maxPageLinks - 2, 1);
    let start = page - Math.floor(visibleCount / 2);
    let end = page + Math.floor(visibleCount / 2);

    if (start < 2) {
      start = 2;
      end = start + visibleCount - 1;
    }
    if (end > totalPages - 1) {
      end = totalPages - 1;
      start = end - visibleCount + 1;
    }

    const items = [{ type: "page", number: 1 }];
    if (start > 2) {
      items.push({ type: "ellipsis", key: "start-ellipsis" });
    }
    for (let current = start; current <= end; current += 1) {
      items.push({ type: "page", number: current });
    }
    if (end < totalPages - 1) {
      items.push({ type: "ellipsis", key: "end-ellipsis" });
    }
    items.push({ type: "page", number: totalPages });
    return items;
  };

  const pageItems = buildPageItems();

  return (
    <div className="table-pagination">
      <button
        type="button"
        className="shot-btn"
        onClick={() => onPageChange(Math.max(page - 1, 1))}
        disabled={page <= 1}
      >
        Previous
      </button>
      {showPageLabel ? (
        <button
          type="button"
          className="table-page-label table-page-label-button"
          onClick={handleJump}
          title="Jump to page"
        >
          Page {page} of {totalPages}
        </button>
      ) : null}
      {showPageLinks ? (
        <div className="table-page-links">
          {pageItems.map((item, index) => {
            if (item.type === "ellipsis") {
              return (
                <span key={item.key || `ellipsis-${index}`} className="table-page-ellipsis">
                  ...
                </span>
              );
            }
              return (
                <button
                  key={item.number}
                  type="button"
                  className={`table-page-link ${
                  item.number === page ? "active" : ""
                }`}
                onClick={() => {
                  if (item.number !== page) {
                    onPageChange(item.number);
                  }
                }}
                aria-current={item.number === page ? "page" : undefined}
              >
                {item.number}
              </button>
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        className="shot-btn"
        onClick={() => onPageChange(Math.min(page + 1, totalPages))}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}
