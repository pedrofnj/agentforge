package main

import "example.com/invoices/internal/web"

func main() {
	web.Listen(":8080")
}
