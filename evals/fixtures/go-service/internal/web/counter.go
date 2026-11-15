package web

import "sync"

var mu sync.Mutex
var visits = map[string]int{}

func CountVisit(path string) {
	visits[path]++
}

func Visits(path string) int {
	mu.Lock()
	defer mu.Unlock()
	return visits[path]
}
