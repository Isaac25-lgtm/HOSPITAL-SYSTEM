<?php
// Create or repair the Crater demo cashier with Crater's own models (the API enforces an 8-char
// password minimum; the demo password "everton" is intentionally 7 characters).
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Crater\Models\User;
use Illuminate\Support\Facades\Hash;
use Silber\Bouncer\BouncerFacade as Bouncer;

$email = 'demo.cashier@vipers.demo';
$u = User::where('email', $email)->first();
if (!$u) {
    $u = User::create(['name' => 'Demo Cashier', 'email' => $email, 'password' => 'everton', 'role' => 'cashier', 'creator_id' => 1]);
    $u->setSettings(['language' => 'en']);
    echo "created user\n";
} elseif (!Hash::check('everton', $u->password)) {
    $u->password = 'everton';
    $u->save();
    echo "password restored\n";
}
$u->companies()->syncWithoutDetaching([1]);
Bouncer::scope()->to(1);
Bouncer::sync($u)->roles(['cashier']);
echo "roles: " . $u->getRoles()->implode(',') . "\n";
