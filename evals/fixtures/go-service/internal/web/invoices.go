package web

import "net/http"

func Listen(addr string) { http.ListenAndServe(addr, nil) }

func InvoiceHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	invoice := store.Find(id)
	writeJSON(w, invoice)
}
