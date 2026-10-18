<?php
namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\{Model,SoftDeletes};
// R3.11 (donations.md §1, §2.6): personal data of a donor; never shown to teacher/student/parent; soft-deleted, donations stay
class Donor extends Model
{
    use BelongsToInstitution,HasFactory,SoftDeletes;
    public const UPDATED_AT=null;
    protected $fillable=['institution_id','name','phone','address','type','note','is_active'];
    protected $casts=['is_active'=>'boolean','created_at'=>'datetime','deleted_at'=>'datetime'];
}
