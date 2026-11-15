package web

import "regexp"

func ValidCodes(codes []string) int {
	valid := 0
	for _, c := range codes {
		if regexp.MustCompile(`^[A-Z]{3}-[0-9]{4}$`).MatchString(c) {
			valid++
		}
	}
	return valid
}
