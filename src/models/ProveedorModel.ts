/* ============================================================================
 * Archivo: ProveedorModel.ts
 * Definicion
 * ============================================================================ */
import {Model} from 'sequelize';

interface ProveedorAtributos{
    id:number,
    nombre:string,
    codigo:string,
    contacto:string,
    email:string,
    creado_en:Date,
    stars:number,
    level:string,
    color:string,
    origin:string,
    rfc:string,
    phone:string,
    address:string,
    category:string,
    since_date:string,
    payment_terms:string,
    total_deliveries:number,
    approval_rate:number,
    defect_rate:number,
    avg_leadtime:number
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class ProveedorModel extends Model<ProveedorAtributos>
    implements ProveedorAtributos{
        id!: number;
        nombre!: string;
        codigo!: string;
        contacto!: string;
        email!: string;
        creado_en!: Date;
        stars!: number;
        level!: string;
        color!: string;
        origin!: string;
        rfc!: string;
        phone!: string;
        address!: string;
        category!: string;
        since_date!: string;
        payment_terms!: string;
        total_deliveries!: number;
        approval_rate!: number;
        defect_rate!: number;
        avg_leadtime!: number;
        static associate(models:any){
            ProveedorModel.hasMany(models.OrdenCompra,{
                foreignKey:'proveedor_id'
            });
            ProveedorModel.hasMany(models.Pedido,{
                foreignKey:'proveedor_id'
            });
            ProveedorModel.hasMany(models.Tag,{
                foreignKey:'proveedor_id'
            });
            ProveedorModel.hasMany(models.Anomalia,{
                foreignKey:'proveedor_id'
            });
            ProveedorModel.hasMany(models.InspeccionQA,{
                foreignKey:'proveedor_id'
            });
        }
    }
    ProveedorModel.init({
        id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            primaryKey:true,
            autoIncrement:true,
            unique:true
        },
        nombre:{
            type:DataTypes.STRING,
            allowNull:false,
            validate:{
                notEmpty:true
            }
        },
        codigo:{
            type:DataTypes.STRING,
            allowNull:false,
            unique:true
        },
        contacto:DataTypes.STRING,
        email:{
            type:DataTypes.STRING,
            validate:{
                isEmail:true
            }
        },
        creado_en:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        stars:{
            type:DataTypes.DECIMAL(2,1),
            defaultValue:0.0
        },
        level:{
            type:DataTypes.ENUM('ELITE','MEDIA','BAJA','NUEVO'),
            defaultValue:'NUEVO'
        },
        color:{
            type:DataTypes.STRING(10),
            defaultValue:'bn'
        },
        origin:{
            type:DataTypes.STRING,
            defaultValue:''
        },
        rfc:{
            type:DataTypes.STRING(20),
            defaultValue:''
        },
        phone:{
            type:DataTypes.STRING(30),
            defaultValue:''
        },
        address:{
            type:DataTypes.STRING,
            defaultValue:''
        },
        category:{
            type:DataTypes.STRING(100),
            defaultValue:''
        },
        since_date:{
            type:DataTypes.STRING(10),
            defaultValue:''
        },
        payment_terms:{
            type:DataTypes.STRING(20),
            defaultValue:''
        },
        total_deliveries:{
            type:DataTypes.INTEGER,
            defaultValue:0
        },
        approval_rate:{
            type:DataTypes.INTEGER,
            defaultValue:0
        },
        defect_rate:{
            type:DataTypes.INTEGER,
            defaultValue:0
        },
        avg_leadtime:{
            type:DataTypes.INTEGER,
            defaultValue:0
        }
    },{
        sequelize,
        modelName:'Proveedor'
    });
    return ProveedorModel;
}