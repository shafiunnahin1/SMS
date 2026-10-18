<?php
namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.11 (donations.md §1, D39): kind is only a tag; restricted funds cannot be overdrawn by expenses
class DonationFund extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    protected $fillable=['institution_id','name','kind','restricted','description','is_active'];
    protected $casts=['restricted'=>'boolean','is_active'=>'boolean'];
}
