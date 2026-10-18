<?php
namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
class Budget extends Model
{
    use BelongsToInstitution,HasFactory;
    public const UPDATED_AT=null;
    protected $fillable=['institution_id','name','fiscal_year','status'];
    protected $casts=['created_at'=>'datetime'];
    public function lines(){return $this->hasMany(BudgetLine::class);}
}
