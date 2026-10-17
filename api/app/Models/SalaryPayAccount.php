<?php

namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SalaryPayAccount extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id','payee_type','payee_id','method','account_name','account_number','bank_name','branch_name','routing_number','is_default'];
    protected $casts = ['account_number'=>'encrypted','is_default'=>'boolean'];
    protected $hidden = ['account_number'];
    public function maskedNumber(): ?string
    {
        return $this->account_number === null ? null : '****'.substr($this->account_number,-4);
    }
}
