<?php
// Trial hospital server: create the hospital's billing user (all billing sections, same password as the
// hospital account), show the hospital's name on invoices, and lock the public demo cashier out.
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Crater\Models\Company;
use Crater\Models\User;
use Silber\Bouncer\BouncerFacade as Bouncer;

$email = getenv('VH_EMAIL');
$pass = getenv('VH_PASS');
$name = getenv('VH_NAME');
if (!$email || !$pass || !$name) { fwrite(STDERR, "VH_EMAIL, VH_PASS and VH_NAME are required\n"); exit(1); }

$u = User::where('email', $email)->first();
if (!$u) {
    $u = User::create(['name' => $name, 'email' => $email, 'password' => $pass, 'role' => 'super admin', 'creator_id' => 1]);
    $u->setSettings(['language' => 'en']);
} else {
    $u->password = $pass;
    $u->save();
}
$u->companies()->syncWithoutDetaching([1]);
Bouncer::scope()->to(1);
Bouncer::sync($u)->roles(['super admin']);

$c = Company::find(1);
if ($c) { $c->name = $name; $c->save(); }

$demo = User::where('email', 'demo.cashier@vipers.demo')->first();
if ($demo) { $demo->password = bin2hex(random_bytes(16)); $demo->save(); }

echo "hospital billing user ready: " . $u->getRoles()->implode(',') . "\n";
