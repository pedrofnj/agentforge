<?php
function showReport(PDO $db, int $reportId): array {
    $stmt = $db->prepare('SELECT * FROM reports WHERE id = ?');
    $stmt->execute([$reportId]);
    return $stmt->fetch();
}
