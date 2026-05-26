/* ============================================================================
 * Archivo: ProveedorModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de Proveedor. Origen de OrdenCompra, Pedido, Tag,
 *              Anomalia e InspeccionQA. PK autoincremental.
 * ============================================================================ */
import {Model} from 'sequelize';

interface ProveedorAtributos{
    id:number,
    nombre:string,
    codigo:string,
    contacto:string,
    email:string,
    creado_en:Date
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
        static associate(models:any){
            //Proveedor 1:N OrdenCompra (genera)
            ProveedorModel.hasMany(models.OrdenCompra,{
                foreignKey:'proveedor_id'
            });
            //Proveedor 1:N Pedido (suministra)
            ProveedorModel.hasMany(models.Pedido,{
                foreignKey:'proveedor_id'
            });
            //Proveedor 1:N Tag (registra)
            ProveedorModel.hasMany(models.Tag,{
                foreignKey:'proveedor_id'
            });
            //Proveedor 1:N Anomalia (tiene)
            ProveedorModel.hasMany(models.Anomalia,{
                foreignKey:'proveedor_id'
            });
            //Proveedor 1:N InspeccionQA (auditado en)
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
        }
    },{
        sequelize,
        modelName:'Proveedor'
    });
    return ProveedorModel;
}