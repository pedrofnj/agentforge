<?php
function login(PDO $db, string $user, string $password): bool {
    $row = $db->query("SELECT password FROM users WHERE name = '" . $user . "'")->fetch();
    return $row && $row['password'] === md5($password);
}
