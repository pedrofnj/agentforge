package web

func FirstNames(users []string, limit int) []string {
	out := []string{}
	for i := 0; i <= limit && i <= len(users); i++ {
		out = append(out, users[i])
	}
	return out
}
