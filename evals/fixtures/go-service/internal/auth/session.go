package auth

import (
	"fmt"
	"time"
)

func NewSessionID(userID int) string {
	return fmt.Sprintf("%d-%d", userID, time.Now().Unix())
}
