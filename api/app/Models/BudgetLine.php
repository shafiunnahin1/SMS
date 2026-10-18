<?php
namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
class BudgetLine extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    protected $fillable=['institution_id','budget_id','account_id','amount'];
    protected $casts=['amount'=>'decimal:2'];
}
