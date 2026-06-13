import { API_BASE_URL } from "@/core/config/env";

export type ProductShellManifestProduct = {
  key: string;
  title: string;
  aliases: string[];
  desktop?: {
    requires_native_agent?: boolean;
    downloads?: {
      windows?: string;
      mac?: string;
    };
    native_capabilities?: string[];
  };
  mobile?: {
    supported?: boolean;
    mode?: string;
  };
  web?: {
    supported?: boolean;
  };
};

export type ProductShellManifest = {
  version: number;
  generated_at: string;
  shell?: {
    desktop_core_agent?: {
      shared_install?: boolean;
      auto_update_ready?: boolean;
      products?: string[];
    };
  };
  products?: ProductShellManifestProduct[];
};

let manifestPromise: Promise<ProductShellManifest | null> | null = null;

export async function fetchProductShellManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${API_BASE_URL}/downloads/bootstrap-products.json`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache"
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`manifest_request_failed:${response.status}`);
        }
        return response.json() as Promise<ProductShellManifest>;
      })
      .catch(() => null);
  }
  return manifestPromise;
}
