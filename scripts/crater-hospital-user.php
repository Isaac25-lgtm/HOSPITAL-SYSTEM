<?php
// Trial hospital server: create the hospital's billing user (all billing sections, same password as the
// hospital account), show the hospital's name on invoices, give the owner account this server's own password,
// lock the public demo cashier out and revoke every login copied from the image (API tokens, sessions,
// remember-me tokens). Exits non-zero unless every step is verified.
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Crater\Models\Company;
use Crater\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Silber\Bouncer\BouncerFacade as Bouncer;

$email = getenv('VH_EMAIL');
$pass = getenv('VH_PASS');
$name = getenv('VH_NAME');
$ownerEmail = getenv('VH_OWNER_EMAIL');
$ownerPass = getenv('VH_OWNER_PASS');
if (!$email || !$pass || !$name) { fwrite(STDERR, "VH_EMAIL, VH_PASS and VH_NAME are required\n"); exit(1); }
$fail = function ($m) { fwrite(STDERR, "FAILED: $m\n"); exit(1); };

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

// the owner account (used by the billing sync service) gets this server's own password
if ($ownerEmail && $ownerPass) {
    $o = User::where('email', $ownerEmail)->first();
    if (!$o) $fail('owner account not found');
    $o->password = $ownerPass;
    $o->save();
}

$demo = User::where('email', 'demo.cashier@vipers.demo')->first();
if ($demo) { $demo->password = bin2hex(random_bytes(16)); $demo->save(); }

// revoke every login copied from the image: a password change alone does not end existing tokens or sessions
DB::table('personal_access_tokens')->delete();
DB::table('sessions')->delete();
DB::table('users')->update(['remember_token' => null]);

// verify
$u = User::where('email', $email)->first();
if (!$u || !Hash::check($pass, $u->password)) $fail('hospital billing user cannot sign in');
if ($demo && Hash::check('everton', User::find($demo->id)->password)) $fail('demo cashier password still works');
if ($ownerEmail && $ownerPass && !Hash::check($ownerPass, User::where('email', $ownerEmail)->first()->password)) $fail('owner password not applied');
if (DB::table('personal_access_tokens')->count() || DB::table('sessions')->count()) $fail('copied tokens or sessions remain');

echo "hospital billing user ready: " . $u->getRoles()->implode(',') . "; copied logins revoked\n";
