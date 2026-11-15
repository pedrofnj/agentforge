<?php
function validateEmail(string $email): bool {
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false && strlen($email) <= 254;
}

function validateSignupEmail(string $email): bool {
    return preg_match('/@/', $email) === 1;
}
